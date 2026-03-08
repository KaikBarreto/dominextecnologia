import {
  Tag, TrendingUp, TrendingDown, DollarSign, CreditCard, Wallet,
  Banknote, Receipt, ShoppingCart, ShoppingBag, Truck, Fuel,
  Zap, Lightbulb, Home, Building2, Wrench, Hammer, Settings,
  Users, UserCheck, Briefcase, FileText, BarChart3, PieChart,
  Globe, Phone, Monitor, Wifi, Cloud, Shield,
  Heart, Star, Gift, Coffee, UtensilsCrossed, Car,
  Plane, MapPin, Package, Box, Layers, Target,
  Percent, Calculator, CircleDollarSign, HandCoins, Landmark, BadgeDollarSign,
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
};

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

export function getCategoryIcon(iconName?: string | null): LucideIcon {
  if (iconName && CATEGORY_ICONS[iconName]) {
    return CATEGORY_ICONS[iconName];
  }
  return Tag;
}
