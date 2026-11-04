import type { Kind } from './types'

export interface Category {
  id: string
  label: string
  kind: Kind
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'groceries', label: 'Groceries', kind: 'expense' },
  { id: 'eating-out', label: 'Eating out', kind: 'expense' },
  { id: 'coffee', label: 'Coffee', kind: 'expense' },
  { id: 'transport', label: 'Transport', kind: 'expense' },
  { id: 'shopping', label: 'Shopping', kind: 'expense' },
  { id: 'school', label: 'School', kind: 'expense' },
  { id: 'housing', label: 'Rent and housing', kind: 'expense' },
  { id: 'bills', label: 'Bills and utilities', kind: 'expense' },
  { id: 'subscriptions', label: 'Subscriptions', kind: 'expense' },
  { id: 'health', label: 'Health', kind: 'expense' },
  { id: 'fun', label: 'Fun', kind: 'expense' },
  { id: 'transfers', label: 'Transfers out', kind: 'expense' },
  { id: 'other', label: 'Other', kind: 'expense' },
]

export const INCOME_CATEGORIES: Category[] = [
  { id: 'paycheck', label: 'Paycheck', kind: 'income' },
  { id: 'aid', label: 'Financial aid', kind: 'income' },
  { id: 'family', label: 'Family support', kind: 'income' },
  { id: 'refund', label: 'Refund', kind: 'income' },
  { id: 'income-other', label: 'Other income', kind: 'income' },
]

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

export function categoryLabel(id: string): string {
  return ALL.find((c) => c.id === id)?.label ?? 'Other'
}

export function categoriesFor(kind: Kind): Category[] {
  return kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
}

export const defaultCategory = (kind: Kind) => (kind === 'expense' ? 'other' : 'income-other')

// Keyword hints for suggesting a category. Suggestions are always editable on the review screen.
const EXPENSE_HINTS: [string, RegExp][] = [
  ['coffee', /\b(coffee|cafe|caff[eè]|espresso|starbucks|peet'?s|philz|blue bottle|dutch bros|boba|tea\b|teahouse)/i],
  ['groceries', /\b(trader joe|safeway|whole foods|grocery|groceries|market|kroger|aldi|costco|berkeley bowl|sprouts|wegmans|publix|h-?e-?b\b|lucky|food ?4 ?less|instacart)/i],
  ['eating-out', /\b(chipotle|doordash|door dash|uber ?eats|grubhub|mcdonald|burger|pizza|taco|sushi|ramen|restaurant|grill|kitchen|diner|subway|panda express|chick-?fil|wingstop|in-n-out|sweetgreen|cava|halal|thai|pho|bakery|bar\b|eats)/i],
  ['transport', /\b(uber|lyft|bart|clipper|muni|metro|transit|parking|shell|chevron|arco|exxon|gas station|76\b|amtrak|bird|lime|caltrain)/i],
  ['subscriptions', /\b(netflix|spotify|hulu|disney|apple\.com|icloud|youtube|prime video|amazon prime|hbo|max\.com|chatgpt|openai|adobe|patreon|subscription)/i],
  ['school', /\b(student store|bookstore|textbook|tuition|university|college|campus|chegg|pearson|course|printing|cal ?1 ?card)/i],
  ['housing', /\b(rent|apartment|landlord|leasing|housing|property)/i],
  ['bills', /\b(pg&?e|pge|electric|utility|utilities|water bill|internet|comcast|xfinity|at&?t|verizon|t-?mobile|phone bill|insurance)/i],
  ['health', /\b(pharmacy|cvs|walgreens|rite aid|tang center|clinic|dental|doctor|medical|health)/i],
  ['fun', /\b(cinema|movie|amc|regal|ticketmaster|concert|steam|playstation|xbox|nintendo|bowling|museum|event)/i],
  ['shopping', /\b(target|amazon|amzn|walmart|ikea|best buy|h&m|uniqlo|zara|nike|sephora|ulta|etsy|shein|old navy|tj ?maxx|marshalls|ross)/i],
  ['transfers', /\b(venmo|zelle|cash app|paypal|transfer to|sent to)/i],
]

const INCOME_HINTS: [string, RegExp][] = [
  ['paycheck', /\b(payroll|direct dep|paycheck|salary|wages|adp|gusto|employer)/i],
  ['aid', /\b(financial aid|fin aid|scholarship|grant|disbursement|fafsa|stipend|work-?study)/i],
  ['refund', /\b(refund|return|reversal|cashback|cash back)/i],
  ['family', /\b(mom|dad|parent|family)/i],
]

export function suggestCategory(description: string, kind: Kind): { id: string; sure: boolean } {
  const hints = kind === 'expense' ? EXPENSE_HINTS : INCOME_HINTS
  for (const [id, re] of hints) if (re.test(description)) return { id, sure: true }
  return { id: defaultCategory(kind), sure: false }
}

/** Words that suggest money coming in when no + or − sign is visible. */
export const INCOME_WORDS = /\b(deposit|direct dep|payroll|paycheck|salary|refund|received|from\b|transfer from|zelle from|venmo from|cash back|interest paid|credit\b|scholarship|financial aid|disbursement|stipend)/i
