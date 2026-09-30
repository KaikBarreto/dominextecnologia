import {
  Tag, TrendingUp, TrendingDown, DollarSign, CreditCard, Wallet,
  Banknote, Receipt, ShoppingCart, ShoppingBag, Truck, Fuel,
  Zap, Lightbulb, Home, Building2, Wrench, Hammer, Settings,
  Users, UserCheck, Briefcase, FileText, BarChart3, PieChart,
  Globe, Phone, Monitor, Wifi, Cloud, Shield,
  Heart, Star, Gift, Coffee, UtensilsCrossed, Car,
  Plane, MapPin, Package, Box, Layers, Target,
  Percent, Calculator, CircleDollarSign, HandCoins, Landmark, BadgeDollarSign,
  RefreshCw, Handshake, Megaphone, Code, Server, Building, MoreHorizontal, Plus, Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Tag,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Wallet,
  Banknote,
  Receipt,
  ShoppingCart,
  ShoppingBag,
  Truck,
  Fuel,
  Zap,
  Lightbulb,
  Home,
  Building2,
  Wrench,
  Hammer,
  Settings,
  Users,
  UserCheck,
  Briefcase,
  FileText,
  BarChart3,
  PieChart,
  Globe,
  Phone,
  Monitor,
  Wifi,
  Cloud,
  Shield,
  Heart,
  Star,
  Gift,
  Coffee,
  UtensilsCrossed,
  Car,
  Plane,
  MapPin,
  Package,
  Box,
  Layers,
  Target,
  Percent,
  Calculator,
  CircleDollarSign,
  HandCoins,
  Landmark,
  BadgeDollarSign,
  RefreshCw,
  Handshake,
  Megaphone,
  Code,
  Server,
  Building,
  MoreHorizontal,
  Plus,
  Circle,
};

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

export function getCategoryIcon(iconName?: string | null): LucideIcon {
  if (iconName && CATEGORY_ICONS[iconName]) {
    return CATEGORY_ICONS[iconName];
  }
  return Tag;
}

/**
 * Ícone de centro de custo. Mesmo catálogo/nome Lucide de `getCategoryIcon`
 * (`cost_centers.icon` usa o mesmo formato de `financial_categories.icon`),
 * mas SEM fallback: centro de custo sem ícone continua renderizando como
 * bolinha lisa (comportamento anterior à introdução do campo), nunca um
 * ícone genérico forçado.
 */
export function getCostCenterIcon(iconName?: string | null): LucideIcon | null {
  if (iconName && CATEGORY_ICONS[iconName]) {
    return CATEGORY_ICONS[iconName];
  }
  return null;
}
