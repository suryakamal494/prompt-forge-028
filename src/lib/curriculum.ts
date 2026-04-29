// CBSE curriculum (Classes 5-8). Edit here to add/remove subjects.
export const CLASS_LEVELS = [5, 6, 7, 8] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

export const SUBJECTS_BY_CLASS: Record<ClassLevel, string[]> = {
  5: ["English", "Hindi", "Mathematics", "EVS", "General Knowledge", "Computer Science"],
  6: ["English", "Hindi", "Mathematics", "Science", "Social Science", "Sanskrit", "Computer Science"],
  7: ["English", "Hindi", "Mathematics", "Science", "Social Science", "Sanskrit", "Computer Science"],
  8: ["English", "Hindi", "Mathematics", "Science", "Social Science", "Sanskrit", "Computer Science"],
};

export const CONTENT_TYPES = [
  { value: "pptx", label: "PowerPoint (PPTX)", accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  { value: "pdf", label: "PDF", accept: "application/pdf,.pdf" },
  { value: "flashcards_json", label: "Flashcards (JSON)", accept: "application/json,.json" },
  { value: "image", label: "Image", accept: "image/*" },
  { value: "other", label: "Other", accept: "*/*" },
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number]["value"];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = Object.fromEntries(
  CONTENT_TYPES.map((c) => [c.value, c.label])
) as Record<ContentType, string>;
