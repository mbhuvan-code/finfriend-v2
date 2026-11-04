import {
  ArrowLeftRight,
  Banknote,
  Bus,
  CircleDollarSign,
  Coffee,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Repeat,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  Users,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  'eating-out': Utensils,
  coffee: Coffee,
  transport: Bus,
  shopping: ShoppingBag,
  school: GraduationCap,
  housing: House,
  bills: Zap,
  subscriptions: Repeat,
  health: HeartPulse,
  fun: Ticket,
  transfers: ArrowLeftRight,
  other: CircleDollarSign,
  paycheck: Banknote,
  aid: Landmark,
  family: Users,
  refund: RotateCcw,
  'income-other': Banknote,
}

export function CategoryIcon({ id, size = 20 }: { id: string; size?: number }) {
  const I = ICONS[id] ?? CircleDollarSign
  return <I size={size} strokeWidth={2} aria-hidden />
}
