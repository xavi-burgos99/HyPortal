export const MEMORY_STEPS = [
  { step: 1, gb: 2 },
  { step: 2, gb: 4 },
  { step: 3, gb: 6 },
  { step: 4, gb: 8 },
  { step: 5, gb: 10 },
  { step: 6, gb: 12 },
  { step: 7, gb: 16 },
  { step: 8, gb: 20 },
  { step: 9, gb: 24 },
  { step: 10, gb: 32 },
  { step: 11, gb: 48 },
  { step: 12, gb: 64 }
] as const;

export const LOW_MEMORY_STEP = 1;
export const DEFAULT_MEMORY_STEP = 2;

export const clampMemoryStep = (value: number) => {
  const min = MEMORY_STEPS[0].step;
  const max = MEMORY_STEPS[MEMORY_STEPS.length - 1].step;
  return Math.min(Math.max(Math.round(value), min), max);
};

export const memoryStepToGb = (step: number) => {
  const found = MEMORY_STEPS.find((item) => item.step === step);
  return found?.gb ?? MEMORY_STEPS[DEFAULT_MEMORY_STEP - 1].gb;
};

export const memoryLabel = (step: number) => `${memoryStepToGb(step)}G`;
