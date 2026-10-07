import { useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Disclosure,
  DisclosureTrigger,
  Slider,
  TextArea,
  TextInput,
} from "../../../../modules/ui/renderer/public";
import { Modal } from "../../components/ui/modal";
import { StatusPreview } from "../../components/ui/status-preview";
import { Tooltip } from "../../components/ui/tooltip";

import { foundationLabels as labels } from "./catalog";

export function TextInputDemo() {
  return (
    <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
      <TextInput aria-label={labels.copy1} placeholder={labels.copy2} />
      <TextInput
        type="number"
        aria-label={labels.copy3}
        defaultValue={25}
        min={1}
        max={100}
      />
      <TextInput aria-label={labels.copy4} value={labels.copy5} readOnly />
      <TextInput
        aria-label={labels.copy6}
        placeholder={labels.copy7}
        disabled
      />
    </div>
  );
}
export function TextAreaDemo() {
  return (
    <div className="grid max-w-2xl gap-3">
      <TextArea aria-label={labels.copy8} placeholder={labels.copy9} rows={3} />
      <TextArea aria-label={labels.copy10} value={labels.copy11} readOnly />
      <TextArea
        aria-label={labels.copy12}
        disabled
        placeholder={labels.copy7}
      />
    </div>
  );
}
export function CheckboxDemo() {
  const [checked, setChecked] = useState(true);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onChange={(e) => setChecked(e.currentTarget.checked)}
        />
        {labels.copy27}
      </label>
      <label className="flex items-center gap-2">
        <Checkbox disabled />
        {labels.copy28}
      </label>
      <label className="flex items-center gap-2">
        <Checkbox defaultChecked disabled />
        {labels.copy29}
      </label>
    </div>
  );
}
export function SliderDemo() {
  const [zoom, setZoom] = useState(100);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        {labels.copy13}
        <Slider
          aria-label={labels.copy13}
          value={zoom}
          min={25}
          max={300}
          step={25}
          onChange={(e) => setZoom(Number(e.currentTarget.value))}
        />
        <output>{zoom}%</output>
      </label>
      <Slider
        aria-label={labels.copy14}
        disabled
        value={100}
        min={25}
        max={300}
      />
    </div>
  );
}
export function DisclosureDemo() {
  return (
    <Disclosure>
      <DisclosureTrigger>{labels.copy23}</DisclosureTrigger>
      <p className="p-2" data-selectable>
        {labels.copy30}
      </p>
      <TextArea aria-label={labels.copy15} placeholder={labels.copy16} />
    </Disclosure>
  );
}
export function ModalDemo() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} variant="secondary" onClick={() => setOpen(true)}>
        {labels.copy31}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={labels.copy17}
        closeLabel={labels.copy18}
        returnFocus={trigger}
      >
        <p>{labels.copy24}</p>
        <TextInput aria-label={labels.copy19} placeholder={labels.copy2} />
      </Modal>
    </>
  );
}
export function StatusPreviewDemo() {
  return (
    <StatusPreview label={labels.copy20} summary={labels.copy21}>
      <p data-selectable>{labels.copy25}</p>
    </StatusPreview>
  );
}
export function TooltipDemo() {
  return (
    <Tooltip content={labels.copy22}>
      <Button variant="secondary">{labels.copy26}</Button>
    </Tooltip>
  );
}
