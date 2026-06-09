
// Source - https://stackoverflow.com/a/2970667
// Posted by Christian C. Salvadó, modified by community. See post 'Timeline' for change history
// Retrieved 2026-06-05, License - CC BY-SA 4.0
export function camelize(str: string) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word: string, index: number) {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}