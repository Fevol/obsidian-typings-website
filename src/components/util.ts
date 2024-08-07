export function getRelativePath(current: string, next: string) {
    const currentSegments = current.split("/")
    const nextSegments = next.split("/")
    const common = currentSegments.reduce((acc, cur, i) => (cur === nextSegments[i] ? i : acc), 0)
    const back = currentSegments.length - common
    let forward = nextSegments.slice(common).join("/")
    if (!forward.endsWith("/"))
        forward += "/"
    return `${"../".repeat(back)}${forward}`
}

export function clickOutside(node: HTMLElement) {
    const handleClick = (event: MouseEvent) => {
        if (node && !node.contains(event.target as HTMLElement) && !event.defaultPrevented)
            node.dispatchEvent(new CustomEvent('click_outside'))
    }
    document.addEventListener('click', handleClick, true);
    return {
        destroy() {
            document.removeEventListener('click', handleClick, true);
        }
    }
}
