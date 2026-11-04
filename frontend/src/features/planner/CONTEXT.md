# Student Degree Planner Feature Slice

## Responsibilities
- **Academic Study Plan Document Generator (`StudyPlanPDF.tsx` - CF-116):**
  - Generates official printable 2-page academic study plan documents via `@react-pdf/renderer` v4.
  - **Page 1 (Lower Division):** Institution header, degree title, department, generation date metadata, total planned and completed credit counter, and Semesters 1 to 4 tables.
  - **Page 2 (Upper Division):** Compact header, Semesters 5 to 8 tables, and the official Academic Compliance Verification Stamp.
  - Multi-semester courses: Accurately evaluates `creditDistribution` arrays and attributes proper split credits to consecutive semesters (e.g. `EC7802` / `EEE7803` 4 credits in Sem 7 and 4 credits in Sem 8).
  - Dynamically computes per-semester load status (Valid $\ge 18\text{ cr}$, Underload $< 18\text{ cr}$, Overload $> 24\text{ cr}$) and global graduation status (`COMPLIANT` vs `PROVISIONAL`).
- **Client-Side PDF Exporter Button (`components/ExportPdfButton.tsx` - CF-116):**
  - Interactive top navigation bar action embedding `@react-pdf/renderer`'s `PDFDownloadLink`.
  - Generates and downloads the official academic PDF within 2 seconds with zero full-page reload.
- **Dynamic File Naming Utility (`utils/pdfFilename.ts` - CF-116):**
  - Formats dynamic export filenames following the strict schema: `CourseFlow_Plan_<Degree>_<Timestamp>.pdf`.

## Invariants
- Only electives selected in Zustand `selectedElectiveIds` are included in the plan; unselected electives are omitted.
- Multi-semester spanning courses must distribute their credits across their respective terms via `creditDistribution`.
- Static and client-side rendering is strictly decoupled using `useSyncExternalStore` to avoid SSR hydration anomalies.
