// Ambient declaration for CSS Modules imports (`import styles from
// './Button.module.css'`). Vite handles these at build/dev time on its
// own; this file exists only so this package's own `tsc --noEmit` (which
// has no Vite in the loop) knows the shape rather than erroring on an
// unresolvable module.
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
