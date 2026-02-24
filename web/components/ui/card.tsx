import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const cardVariants = cva("rounded-xl border border-border p-4", {
  variants: {
    variant: {
      default: "bg-card shadow-sm",
      subtle: "bg-muted/40 shadow-none",
      elevated: "bg-card shadow-md"
    },
    density: {
      default: "p-4",
      compact: "p-3"
    }
  },
  defaultVariants: {
    variant: "default",
    density: "default"
  }
});

export function Card({
  className,
  variant,
  density,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ variant, density }), className)} {...props} />;
}
