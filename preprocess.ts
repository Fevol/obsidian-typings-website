import { readdir } from "node:fs/promises";
import {
    basename,
    dirname,
    join,
    relative
} from "node:path/posix";

import { Project } from "ts-morph";

const project = new Project();

const augmentations = new Map<string, string>();
const imports = new Map<string, Set<string>>();

async function convertRecursive(dir: string): Promise<void> {
    for (const dirent of await readdir(dir, { withFileTypes: true })) {
        if (dirent.isDirectory()) {
            await convertRecursive(`${dir}/${dirent.name}`);
        } else if (dirent.name.endsWith(".d.ts")) {
            const filePath = `${dir}/${dirent.name}`;
            if (!filePath.includes("augmentations")) {
                continue;
            }
            const augmentationsDirName = basename(dirname(dir));

            console.log(`Processing ${filePath}`);
            const sourceFile = project.addSourceFileAtPath(filePath);
            for (const importDeclaration of sourceFile.getImportDeclarations()) {
                let moduleSpecifier = importDeclaration.getModuleSpecifierValue();
                if (moduleSpecifier.startsWith(".")) {
                    const moduleSourceFile = importDeclaration.getModuleSpecifierSourceFileOrThrow();
                    const relativePath = relative(srcDir, moduleSourceFile.getFilePath())
                    moduleSpecifier = "./" + relativePath.replace(/(\.d)?\.ts$/, ".js");
                }
                const importedNames = importDeclaration.getNamedImports().map(namedImport => namedImport.getName());
                if (!imports.has(moduleSpecifier)) {
                    imports.set(moduleSpecifier, new Set());
                }
                for (const importedName of importedNames) {
                    imports.get(moduleSpecifier)!.add(importedName);
                }
            }

            for (const module of sourceFile.getModules()) {
                augmentations.set(augmentationsDirName, (augmentations.get(augmentationsDirName) ?? "") + module.getBodyText() + "\n");
            }
        }
    }
}

const srcDir = join(process.cwd().replaceAll("\\", "/"), "./obsidian-typings/src");
await convertRecursive(srcDir);

const typesSourceFile = project.addSourceFileAtPath("./obsidian-typings/src/types.d.ts");
for (const [moduleSpecifier, importedNames] of imports) {
    typesSourceFile.addImportDeclaration({
        moduleSpecifier: moduleSpecifier,
        namedImports: Array.from(importedNames).map(importedName => ({
            name: importedName
        }))
    });
}

for (const [augmentationsDirName, augmentation] of augmentations) {
    const namespaceName = "_" + augmentationsDirName.replace(/[^a-zA-Z0-9]/g, "_");
    typesSourceFile.addModule({
        name: namespaceName,
        isExported: true,
        statements: augmentation
    })
}

await typesSourceFile.save();
