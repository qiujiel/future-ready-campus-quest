import {
  forwardRef,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
} from "react";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    busy?: boolean;
    variant?: "primary" | "secondary" | "quiet" | "danger";
  }
>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      busy = false,
      children,
      className = "",
      disabled,
      type = "button",
      variant = "primary",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={`quest-button quest-button--${variant} ${className}`.trim()}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
      >
        {children}
      </button>
    );
  },
);
