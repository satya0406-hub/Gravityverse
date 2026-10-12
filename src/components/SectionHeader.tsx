import { cn } from '../lib/utils';

interface SectionHeaderProps {
  whiteText: string;
  blueText: string;
  description?: string;
  className?: string;
  align?: 'left' | 'center';
}

export function SectionHeader({ whiteText, blueText, description, className, align = 'left' }: SectionHeaderProps) {
  return (
    <div className={cn("space-y-4", align === 'center' ? "text-center" : "text-left", className)}>
      <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold font-serif leading-tight tracking-tight">
        <span className="text-white">{whiteText}</span>
        {blueText && <span className="premium-gradient-text ml-2 sm:ml-4">{blueText}</span>}
      </h1>
      {description && (
        <p className={cn("text-slate-400 max-w-2xl text-lg leading-relaxed", align === 'center' ? "mx-auto" : "")}>
          {description}
        </p>
      )}
    </div>
  );
}
