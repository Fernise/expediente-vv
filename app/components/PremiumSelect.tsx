"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/app/components/Language";
import {
  KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type PremiumSelectOption = {
  /** User-authored names must retain their original language. */
  translate?: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  value: string;
};

type PremiumSelectProps = {
  ariaLabel: string;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  onChange?: (value: string) => void;
  options: PremiumSelectOption[];
  placeholder?: string;
  value?: string;
};

export function PremiumSelect({
  ariaLabel,
  className = "",
  defaultValue = "",
  disabled = false,
  name,
  onChange,
  options,
  placeholder = "Selecciona una opción",
  value,
}: PremiumSelectProps) {
  const { t } = useLanguage();
  const optionLabel = (option: PremiumSelectOption) => option.translate === false ? option.label : t(option.label);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchRef = useRef({ text: "", time: 0 });
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue);
  const enabledOptions = options
    .map((option, index) => ({ index, option }))
    .filter(({ option }) => !option.disabled);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    optionRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open, placement]);

  useLayoutEffect(() => {
    if (!open) { setPlacement(null); return; }
    function positionMenu(event?: Event) {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 18;
      const above = rect.top - 18;
      const upwards = below < 180 && above > below;
      const maxHeight = Math.max(60, Math.min(320, upwards ? above : below));
      setPlacement({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: upwards ? Math.max(12, rect.top - maxHeight - 6) : rect.bottom + 6,
        width, maxHeight });
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => { window.removeEventListener("resize", positionMenu); window.removeEventListener("scroll", positionMenu, true); };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function openList(preferredIndex?: number) {
    if (disabled) return;
    const selectedIndex = options.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    );
    setOpen(true);
    setFocusedIndex(
      preferredIndex ??
        (selectedIndex >= 0
          ? selectedIndex
          : (enabledOptions[0]?.index ?? -1)),
    );
  }

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    // The trigger is never unmounted; restore focus now. A delayed callback
    // could steal focus from the options if the user immediately reopens it.
    triggerRef.current?.focus();
  }

  function moveFocus(direction: 1 | -1) {
    if (enabledOptions.length === 0) return;
    const currentPosition = enabledOptions.findIndex(
      ({ index }) => index === focusedIndex,
    );
    const nextPosition =
      currentPosition < 0
        ? direction === 1
          ? 0
          : enabledOptions.length - 1
        : (currentPosition + direction + enabledOptions.length) %
          enabledOptions.length;
    setFocusedIndex(enabledOptions[nextPosition].index);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openList();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openList(enabledOptions.at(-1)?.index);
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    option: PremiumSelectOption,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setFocusedIndex(enabledOptions[0]?.index ?? -1);
    } else if (event.key === "End") {
      event.preventDefault();
      setFocusedIndex(enabledOptions.at(-1)?.index ?? -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(option.value);
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      if (event.key === "Escape") {
        event.preventDefault();
        triggerRef.current?.focus();
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - searchRef.current.time < 700 ? searchRef.current.text : "";
      const typed = `${previous}${event.key}`;
      searchRef.current = { text: typed, time: now };
      const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
      // Repeated letters cycle through matching options instead of building "ttt".
      const query = normalize([...typed].every((letter) => letter === typed[0]) ? event.key : typed);
      const rotated = [...enabledOptions.filter(({ index }) => index > focusedIndex), ...enabledOptions.filter(({ index }) => index <= focusedIndex)];
      const match = rotated.find(({ option: candidate }) => normalize(optionLabel(candidate)).startsWith(query));
      if (match) setFocusedIndex(match.index);
    }
  }

  return (
    <div
      className={`premium-select ${open ? "is-open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      <LocalizedControl as="button"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t(ariaLabel)}
        aria-describedby={`${listboxId}-value`}
        className="premium-select-trigger"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span id={`${listboxId}-value`} className={selected ? "" : "placeholder"}>
          <strong>{selected ? optionLabel(selected) : t(placeholder)}</strong>
          {selected?.description ? (
            <small>{t(selected.description)}</small>
          ) : null}
        </span>
        <ChevronDown aria-hidden="true" />
      </LocalizedControl>
      {open && placement ? createPortal(
        <LocalizedControl as="div"
          ref={menuRef}
          aria-label={t(ariaLabel)}
          className="premium-select-menu"
          id={listboxId}
          role="listbox"
          style={{ position: "fixed", ...placement, minWidth: 0, maxWidth: "calc(100vw - 24px)", right: "auto", marginTop: 0, zIndex: 1000 }}
        >
          {options.map((option, index) => {
            const active = option.value === selectedValue;
            return (
              <button
                aria-selected={active}
                className="premium-select-option"
                disabled={option.disabled}
                key={option.value}
                onClick={() => choose(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, option)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                tabIndex={focusedIndex === index ? 0 : -1}
                type="button"
              >
                <span>
                  <strong>{optionLabel(option)}</strong>
                  {option.description ? (
                    <small>{t(option.description)}</small>
                  ) : null}
                </span>
                {active ? <Check aria-hidden="true" /> : null}
              </button>
            );
          })}
        </LocalizedControl>, document.body,
      ) : null}
    </div>
  );
}
