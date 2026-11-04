/**
 * Generates dynamic filename for exported PDF:
 * Pattern: CourseFlow_Plan_<Degree>_<Timestamp>.pdf
 */
export function getPdfFileName(degreeName: string, date: Date = new Date()): string {
    const degreeSlug = degreeName
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_');
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    const timestamp = `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
    return `CourseFlow_Plan_${degreeSlug}_${timestamp}.pdf`;
}
