import { type HTMLAttributes, type PropsWithChildren, useId } from "react";

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    title: string;
    eyebrow?: string;
    headingLevel?: 2 | 3;
  }
>;

export function Card({
  children,
  className = "",
  eyebrow,
  headingLevel = 2,
  title,
  ...props
}: CardProps) {
  const titleId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section
      {...props}
      className={`quest-card ${className}`.trim()}
      aria-labelledby={titleId}
    >
      {eyebrow ? <p className="quest-card__eyebrow">{eyebrow}</p> : null}
      <Heading id={titleId} className="quest-card__title">
        {title}
      </Heading>
      <div className="quest-card__body">{children}</div>
    </section>
  );
}
