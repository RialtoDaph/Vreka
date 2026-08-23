"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategoryGroup } from "@/lib/categories";
import { inputClass } from "@/lib/ui";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  groups: CategoryGroup[];
  disabled?: boolean;
  placeholder?: string;
};

// A searchable dropdown over a fixed, grouped list of categories -- not a
// free-text field. Typing filters the list; the value only ever changes via
// an explicit pick (click or Enter), so an unmatched typed string just
// reverts to the last real selection on blur instead of becoming a stray
// category that isn't in the enum anywhere else in the app.
export default function CategorySelect({ id, value, onChange, groups, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  // Separate from `query` so opening the dropdown on an already-selected
  // value (the input starts pre-filled with it) shows every option, not
  // just whatever happens to match the current selection's own text --
  // this only narrows once the user actually types something.
  const [filterText, setFilterText] = useState("");

  // Keeps the visible text in sync when `value` changes from outside (e.g.
  // resetForm, or startEdit loading an existing category onto the form).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filteredGroups = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) => ({ group: g.group, items: g.items.filter((c) => c.toLowerCase().includes(needle)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, filterText]);

  function openDropdown() {
    setFilterText("");
    setOpen(true);
  }

  function select(category: string) {
    onChange(category);
    setQuery(category);
    setOpen(false);
  }

  function revertAndClose() {
    setOpen(false);
    setQuery(value);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value);
          setFilterText(e.target.value);
          setOpen(true);
        }}
        onBlur={revertAndClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            revertAndClose();
          } else if (e.key === "Enter") {
            // Inside a <form>, Enter would otherwise submit it with
            // whatever's been typed so far -- pick the top filtered match
            // instead, same as a real combobox.
            e.preventDefault();
            const first = filteredGroups[0]?.items[0];
            if (first) select(first);
          }
        }}
        className={inputClass}
      />
      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-panel border border-line rounded-sm shadow-glow">
          {filteredGroups.length === 0 ? (
            <p className="px-3 py-2 text-xs text-fg-subtle">Nggak ada yang cocok.</p>
          ) : (
            filteredGroups.map((g) => (
              <div key={g.group}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
                  {g.group}
                </p>
                {g.items.map((c) => (
                  <button
                    type="button"
                    key={c}
                    // Fires before the input's onBlur, which would otherwise
                    // close the dropdown (and revert the query) first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(c)}
                    className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-panel2 ${
                      c === value ? "text-cyan-glow" : "text-fg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
