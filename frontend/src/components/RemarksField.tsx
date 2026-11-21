/**
 * RemarksField.tsx
 * Guide: Reusable dropdown para sa common BHW vaccine remarks na may "Other" text input
 * kapag custom ang note. Ginagamit sa DoseEntryForm, CorrectionForm, at ImmunizationDocument.
 */
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
 * Remarks picker: dropdown ng mga preset BHW remarks plus free-text input kapag pinili ang "Other".
 * Kapag yung naka-save na value ay nasa preset list, naka-select yun; kung hindi, naka-"Other"
 * siya at nire-retain ang custom text.
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
  // Naka-track nang hiwalay yung "Other" mode para hindi mawala yung text box kahit blangko pa yung tinatype.
  const [otherMode, setOtherMode] = useState(!isPreset && value !== '');
  const selectValue = otherMode ? REMARK_OTHER : value === '' ? '' : value;

  return (
    <div>
      {/* Preset remarks dropdown selector */}
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
      {/* Free-text input na lumalabas lang kapag "Other" ang napili sa dropdown */}
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
