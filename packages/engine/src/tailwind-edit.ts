/**
 * tailwind-edit.ts — CSS→Tailwind class replacement + className string parser.
 *
 * Used by the apply-style endpoint to persist visual edits to source files.
 * Reads the source file, finds the className at a given line, replaces the
 * old utility class with the new one, and writes back.
 */

// ---- Tailwind Lookup Maps ----

const TW_FONT_SIZE: Record<string, string> = {
  '12px': 'text-xs', '14px': 'text-sm', '16px': 'text-base', '18px': 'text-lg',
  '20px': 'text-xl', '24px': 'text-2xl', '30px': 'text-3xl', '36px': 'text-4xl',
  '48px': 'text-5xl', '60px': 'text-6xl', '72px': 'text-7xl', '96px': 'text-8xl', '128px': 'text-9xl',
}

const TW_FONT_WEIGHT: Record<string, string> = {
  '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal',
  '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
}

const TW_SPACING: Record<string, string> = {
  '0px': '0', '1px': 'px', '2px': '0.5', '4px': '1', '6px': '1.5', '8px': '2',
  '10px': '2.5', '12px': '3', '14px': '3.5', '16px': '4', '20px': '5', '24px': '6',
  '28px': '7', '32px': '8', '36px': '9', '40px': '10', '44px': '11', '48px': '12',
  '56px': '14', '64px': '16', '80px': '20', '96px': '24',
}

const TW_BORDER_RADIUS: Record<string, string> = {
  '0px': 'rounded-none', '2px': 'rounded-sm', '4px': 'rounded',
  '6px': 'rounded-md', '8px': 'rounded-lg', '12px': 'rounded-xl',
  '16px': 'rounded-2xl', '24px': 'rounded-3xl', '9999px': 'rounded-full',
}

const TW_TEXT_ALIGN: Record<string, string> = {
  'left': 'text-left', 'center': 'text-center', 'right': 'text-right', 'justify': 'text-justify',
}

// ---- CSS property → Tailwind prefix mapping ----

const PROPERTY_PREFIX: Record<string, string> = {
  fontSize: 'text',
  fontWeight: 'font',
  textAlign: 'text',
  color: 'text',
  backgroundColor: 'bg',
  borderColor: 'border',
  paddingTop: 'pt', paddingRight: 'pr', paddingBottom: 'pb', paddingLeft: 'pl',
  marginTop: 'mt', marginRight: 'mr', marginBottom: 'mb', marginLeft: 'ml',
  borderRadius: 'rounded',
  borderWidth: 'border',
  width: 'w',
  height: 'h',
}

// ---- CSS value → Tailwind class conversion ----

export function cssToTailwind(property: string, value: string): string {
  // Font size
  if (property === 'fontSize') return TW_FONT_SIZE[value] || `text-[${value}]`
  if (property === 'fontWeight') return TW_FONT_WEIGHT[value] || `font-[${value}]`
  if (property === 'textAlign') return TW_TEXT_ALIGN[value] || `text-${value}`

  // Colors (hex values)
  if (property === 'color') return `text-[${value}]`
  if (property === 'backgroundColor') return `bg-[${value}]`
  if (property === 'borderColor') return `border-[${value}]`

  // Spacing
  const spacingPrefix: Record<string, string> = {
    paddingTop: 'pt', paddingRight: 'pr', paddingBottom: 'pb', paddingLeft: 'pl',
    marginTop: 'mt', marginRight: 'mr', marginBottom: 'mb', marginLeft: 'ml',
  }
  if (spacingPrefix[property]) {
    const prefix = spacingPrefix[property]
    const tw = TW_SPACING[value]
    return tw ? `${prefix}-${tw}` : `${prefix}-[${value}]`
  }

  // Border radius
  if (property === 'borderRadius') return TW_BORDER_RADIUS[value] || `rounded-[${value}]`
  if (property === 'borderWidth') {
    if (value === '0px') return 'border-0'
    if (value === '1px') return 'border'
    if (value === '2px') return 'border-2'
    if (value === '4px') return 'border-4'
    if (value === '8px') return 'border-8'
    return `border-[${value}]`
  }

  // Size
  if (property === 'width') {
    if (value === 'auto') return 'w-auto'
    if (value === '100%') return 'w-full'
    return `w-[${value}]`
  }
  if (property === 'height') {
    if (value === 'auto') return 'h-auto'
    if (value === '100%') return 'h-full'
    return `h-[${value}]`
  }

  return `[${property}:${value}]`
}

// ---- Get the Tailwind prefix for a class (used to find conflicting classes) ----

export function getTailwindPrefix(twClass: string): string {
  // Handle arbitrary values: text-[22px] → "text-"
  const arbMatch = twClass.match(/^([a-z]+-)\[/)
  if (arbMatch) return arbMatch[1]

  // Handle standard classes: text-2xl → "text-", rounded-lg → "rounded-", pt-4 → "pt-"
  // But preserve prefixes like "font-" (font-bold), "bg-" (bg-blue-500)
  const parts = twClass.split('-')
  if (parts.length <= 1) return twClass

  // For spacing/sizing: pt-4 → "pt-", mt-8 → "mt-", w-full → "w-", h-64 → "h-"
  const shortPrefixes = new Set(['pt', 'pr', 'pb', 'pl', 'mt', 'mr', 'mb', 'ml', 'p', 'm', 'w', 'h', 'gap', 'min-w', 'max-w', 'min-h', 'max-h'])
  if (shortPrefixes.has(parts[0])) return parts[0] + '-'

  // For multi-part prefixes: text-2xl → "text-", bg-blue-500 → "bg-", border-2 → "border-"
  return parts[0] + '-'
}

// ---- Replace a Tailwind class in a className string on a specific line ----

export interface ClassReplacement {
  property: string
  oldClass: string  // class prefix to remove (e.g. "text-lg", or just prefix "text-" to match any)
  newClass: string  // new Tailwind class to add
}

/**
 * Apply a class replacement to a source file at a specific line.
 * Handles three className patterns:
 *   1. className="..." (static string)
 *   2. className={`...`} (template literal)
 *   3. className={cn("...", ...)} or className={clsx("...", ...)}
 *
 * Returns the modified file content, or null if replacement couldn't be applied.
 */
export function applyClassReplacement(
  fileContent: string,
  lineNumber: number,
  newTwClass: string,
  property: string,
): string | null {
  const lines = fileContent.split('\n')
  const prefix = getTailwindPrefix(newTwClass)

  // Search around the target line (±3 lines) for className
  const searchStart = Math.max(0, lineNumber - 4)
  const searchEnd = Math.min(lines.length - 1, lineNumber + 3)

  for (let i = searchStart; i <= searchEnd; i++) {
    const line = lines[i]

    // Pattern 1: className="..."
    const staticMatch = line.match(/className="([^"]*)"/)
    if (staticMatch) {
      const oldClasses = staticMatch[1]
      const newClasses = replaceClassInString(oldClasses, prefix, newTwClass)
      lines[i] = line.replace(`className="${oldClasses}"`, `className="${newClasses}"`)
      return lines.join('\n')
    }

    // Pattern 2: className={`...`}
    const templateMatch = line.match(/className=\{`([^`]*)`\}/)
    if (templateMatch) {
      const oldClasses = templateMatch[1]
      const newClasses = replaceClassInString(oldClasses, prefix, newTwClass)
      lines[i] = line.replace(`className={\`${oldClasses}\`}`, `className={\`${newClasses}\`}`)
      return lines.join('\n')
    }

    // Pattern 3: className={cn("...", ...)} or clsx("...", ...)
    const cnMatch = line.match(/className=\{(?:cn|clsx|twMerge)\(/)
    if (cnMatch) {
      // Find the first string literal inside cn()
      const stringMatch = line.match(/(?:cn|clsx|twMerge)\(\s*["']([^"']*)["']/)
      if (stringMatch) {
        const oldClasses = stringMatch[1]
        const newClasses = replaceClassInString(oldClasses, prefix, newTwClass)
        lines[i] = line.replace(stringMatch[1], newClasses)
        return lines.join('\n')
      }
    }
  }

  // Fallback: couldn't find className near the target line
  return null
}

/**
 * Replace a class with a matching prefix in a space-separated class string.
 * If no matching class exists, appends the new class.
 */
function replaceClassInString(classString: string, prefix: string, newClass: string): string {
  const classes = classString.split(/\s+/).filter(Boolean)

  // Find and remove any class with the same prefix
  const filtered = classes.filter(c => {
    const existingPrefix = getTailwindPrefix(c)
    return existingPrefix !== prefix
  })

  filtered.push(newClass)
  return filtered.join(' ')
}
