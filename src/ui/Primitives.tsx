import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { X, PackageOpen, ImageOff } from "lucide-react";
export function IconButton({
  label,
  children,
  onClick,
  className = "",
  disabled = false,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      {...rest}
      className={"icon-button " + className}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <PackageOpen size={32} strokeWidth={1.3} />
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const current = ref.current;
    return () => {
      current?.close();
      queueMicrotask(() => {
        if (previous?.isConnected && !document.querySelector("dialog[open]"))
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label="닫기" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Thumb({
  id,
  available,
  failures = [],
  className = "",
}: {
  id: string | null;
  available: string[];
  failures?: string[];
  className?: string;
}) {
  return (
    <div className={"asset-thumb " + className}>
      {id && available.includes(id) ? (
        <img
          loading="lazy"
          src={"/api/thumbnail/" + encodeURIComponent(id)}
          alt=""
        />
      ) : id && failures.includes(id) ? (
        <ImageOff size={22} strokeWidth={1.2} aria-label="미리보기 실패" />
      ) : (
        <PackageOpen size={22} strokeWidth={1.2} />
      )}
    </div>
  );
}
