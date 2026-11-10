import { useState } from 'react';
import { REMARK_OPTIONS, REMARK_OTHER } from '../data/remarkOptions';

interface RemarksFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  selectClassName: string;
  inputClassName: string;
  labelClassName: string;
}

/**
 * Remarks picker: dropdown of common BHW remarks plus free typing
 * via "Other". A stored value that matches a preset shows as that
 * preset; any other stored text shows as "Other" with the text kept.
 */
export default function RemarksField({
  id,
  value,
  onChange,
  label = 'Remarks',
  selectClassName,
  inputClassName,
  labelClassName,
}: RemarksFieldProps) {
  const isPreset = REMARK_OPTIONS.includes(value);
  const [custom, setCustom] = useState(isPreset || value === '' ? '' : value);
  // Track "Other" as its own choice so an empty typed remark doesn't
  // collapse back to "No remarks" and hide the text box.
  const [otherMode, setOtherMode] = useState(!isPreset && value !== '');
  const selectValue = otherMode ? REMARK_OTHER : value === '' ? '' : value;

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select
        id={id}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === REMARK_OTHER) {
            setOtherMode(true);
            onChange(custom);
          } else {
            setOtherMode(false);
            onChange(next);
          }
        }}
        className={selectClassName}
      >
        <option value="">No remarks</option>
        {REMARK_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={REMARK_OTHER}>{REMARK_OTHER}</option>
      </select>
      {selectValue === REMARK_OTHER && (
        <input
          aria-label={`${label} (other)`}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Type the remark…"
          className={`${inputClassName} mt-2`}
        />
      )}
    </div>
  );
}
