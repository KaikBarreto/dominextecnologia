export const SONNER_TOAST_CLASS_NAMES = {
  toast:
    "group toast !grid !w-[min(34rem,calc(100vw-2rem))] !min-h-[4.5rem] !grid-cols-[4.5rem_minmax(0,1fr)] !grid-rows-[auto_auto] !items-stretch !gap-0 !overflow-hidden !rounded-md !border-border !bg-background !p-0 !text-foreground !shadow-lg",
  content: "!col-start-2 !row-start-1 !w-full !min-w-0 !self-center !pb-2 !pl-4 !pr-12 !pt-3.5",
  icon: "!col-start-1 !row-span-2 !row-start-1 !m-0 !h-auto !w-[4.5rem] !min-w-[4.5rem] !self-stretch !rounded-none !text-white [&>svg]:!h-6 [&>svg]:!w-6",
  title: "!block !w-full !break-words !text-sm !font-semibold !text-foreground",
  description: "!mt-0.5 !block !w-full !break-words !text-sm !text-muted-foreground",
  actionButton: "!col-start-2 !row-start-2 !mb-3 !ml-4 !mr-12 !h-8 !w-fit !justify-self-start !self-start !bg-transparent !px-2 !font-semibold !text-foreground hover:!bg-muted",
  cancelButton: "!col-start-2 !row-start-2 !mb-3 !ml-4 !mr-12 !h-8 !w-fit !justify-self-start !self-start !bg-transparent !px-2 !font-semibold !text-muted-foreground hover:!bg-muted",
  closeButton:
    "!left-auto !right-2 !top-1/2 !h-7 !w-7 !-translate-y-1/2 !translate-x-0 !border-0 !bg-transparent !text-muted-foreground !opacity-100 !shadow-none hover:!bg-muted hover:!text-foreground",
  success: "[&_[data-icon]]:!bg-emerald-600",
  error: "[&_[data-icon]]:!bg-red-600",
  warning: "[&_[data-icon]]:!bg-amber-600",
  info: "[&_[data-icon]]:!bg-blue-600",
  loading: "[&_[data-icon]]:!bg-slate-600",
  default: "[&_[data-icon]]:!bg-slate-700",
} as const;
