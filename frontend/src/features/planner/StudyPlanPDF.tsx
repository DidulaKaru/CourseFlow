import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Course, DegreeProgram } from '@/types/curriculum';

export interface StudyPlanPDFProps {
    program?: DegreeProgram;
    programName?: string;
    department?: string;
    planName?: string;
    courses?: Course[];
    selectedElectiveIds?: string[];
    completedCourseIds?: string[];
    totalCreditsRequired?: number;
    generatedAt?: string;
}

const styles = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        fontSize: 8,
        paddingTop: 24,
        paddingBottom: 24,
        paddingHorizontal: 28,
        color: '#1e293b',
        backgroundColor: '#ffffff',
    },
    // Document Header
    headerContainer: {
        borderBottomWidth: 1.5,
        borderBottomColor: '#4f46e5',
        paddingBottom: 8,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    brandTitle: {
        fontSize: 15,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a',
    },
    brandSub: {
        fontSize: 7.5,
        color: '#64748b',
        marginTop: 1,
    },
    degreeTitle: {
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        color: '#4338ca',
        marginTop: 3,
    },
    departmentText: {
        fontSize: 7.5,
        color: '#475569',
        marginTop: 1,
    },
    metaBox: {
        alignItems: 'flex-end',
    },
    metaText: {
        fontSize: 7.5,
        color: '#475569',
        marginBottom: 1,
    },
    progressBadge: {
        marginTop: 3,
        paddingHorizontal: 6,
        paddingVertical: 2.5,
        borderRadius: 4,
        borderWidth: 1,
    },
    badgeValid: {
        backgroundColor: '#ecfdf5',
        borderColor: '#10b981',
    },
    badgeInvalid: {
        backgroundColor: '#fffbeb',
        borderColor: '#f59e0b',
    },
    badgeTextValid: {
        color: '#047857',
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
    },
    badgeTextInvalid: {
        color: '#b45309',
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
    },

    // Compact Header for Page 2
    page2Header: {
        borderBottomWidth: 1,
        borderBottomColor: '#cbd5e1',
        paddingBottom: 6,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    page2Title: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: '#1e293b',
    },

    // Semester Section Card
    semesterCard: {
        marginBottom: 7,
        borderWidth: 0.8,
        borderColor: '#cbd5e1',
        borderRadius: 4,
        overflow: 'hidden',
    },
    semesterHeader: {
        backgroundColor: '#f8fafc',
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 0.8,
        borderBottomColor: '#cbd5e1',
    },
    semesterTitle: {
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a',
    },
    semesterCredits: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
    },
    semValid: {
        color: '#059669',
    },
    semUnderload: {
        color: '#dc2626',
    },
    semOverload: {
        color: '#d97706',
    },

    // Table Header & Rows
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 6,
        paddingVertical: 2.5,
        borderBottomWidth: 0.5,
        borderBottomColor: '#cbd5e1',
    },
    tableHeaderCell: {
        fontSize: 6.5,
        fontFamily: 'Helvetica-Bold',
        color: '#475569',
        textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row',
        paddingHorizontal: 6,
        paddingVertical: 2.5,
        borderBottomWidth: 0.5,
        borderBottomColor: '#f1f5f9',
        alignItems: 'center',
    },
    tableRowEven: {
        backgroundColor: '#fafafa',
    },
    colCode: {
        width: '18%',
        fontFamily: 'Helvetica-Bold',
        fontSize: 7,
        color: '#0f172a',
    },
    colTitle: {
        width: '46%',
        fontSize: 7,
        color: '#334155',
    },
    colType: {
        width: '16%',
        fontSize: 6.5,
        color: '#64748b',
    },
    colCredits: {
        width: '10%',
        textAlign: 'right',
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a',
    },
    colStatus: {
        width: '10%',
        textAlign: 'right',
        fontSize: 6.5,
    },
    statusCompleted: {
        color: '#059669',
        fontFamily: 'Helvetica-Bold',
    },
    statusPlanned: {
        color: '#64748b',
    },
    statusSelected: {
        color: '#4f46e5',
        fontFamily: 'Helvetica-Bold',
    },

    // Official Compliance Verification Stamp
    stampContainer: {
        marginTop: 6,
        padding: 8,
        borderWidth: 1.2,
        borderColor: '#059669',
        borderRadius: 5,
        backgroundColor: '#f0fdf4',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    stampTitle: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: '#065f46',
    },
    stampSubtitle: {
        fontSize: 7,
        color: '#047857',
        marginTop: 2,
    },
    stampBadge: {
        borderWidth: 1.2,
        borderColor: '#059669',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        backgroundColor: '#ffffff',
        alignItems: 'center',
    },
    stampBadgeText: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: '#047857',
        textTransform: 'uppercase',
    },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 12,
        left: 28,
        right: 28,
        borderTopWidth: 0.5,
        borderTopColor: '#e2e8f0',
        paddingTop: 3.5,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 6.5,
        color: '#94a3b8',
    },
});

interface SemesterRowData {
    code: string;
    title: string;
    type: string;
    semesterCredits: number;
    status: 'Completed' | 'Selected' | 'Planned';
}

interface SemesterGroupData {
    semesterIndex: number;
    credits: number;
    rows: SemesterRowData[];
    isUnderload: boolean;
    isOverload: boolean;
    isValid: boolean;
}

/**
 * Clean, printable 2-page academic study plan document (CF-116).
 * Page 1: Degree Header + Semesters 1 to 4
 * Page 2: Header + Semesters 5 to 8 + Official Compliance Verification Stamp
 */
export function StudyPlanPDF({
    program,
    programName,
    department,
    planName,
    courses: injectedCourses,
    selectedElectiveIds = [],
    completedCourseIds = [],
    totalCreditsRequired = 150,
    generatedAt = 'Current Session',
}: StudyPlanPDFProps) {
    const resolvedName = programName ?? program?.name ?? 'Engineering Curriculum';
    const resolvedDept = department ?? program?.department ?? 'Faculty of Engineering';
    const allCourses = injectedCourses ?? program?.courses ?? [];
    const dateFormatted = generatedAt;

    const selectedSet = new Set(selectedElectiveIds);
    const completedSet = new Set(completedCourseIds);

    // Group courses by semester (1 through 8)
    const semesterGroups: SemesterGroupData[] = Array.from({ length: 8 }, (_, idx) => {
        const sem = idx + 1;
        const rows: SemesterRowData[] = [];
        let totalSemCredits = 0;

        for (const course of allCourses) {
            // Check if course has credit allocated in this semester
            let semAllocatedCredits = 0;
            if (course.creditDistribution && course.creditDistribution.length > 0) {
                const dist = course.creditDistribution.find((d) => d.semesterIndex === sem);
                if (dist) {
                    semAllocatedCredits = dist.creditsAllocated;
                }
            } else if (course.recommendedSemester === sem) {
                semAllocatedCredits = course.totalCredits;
            }

            if (semAllocatedCredits <= 0) continue;

            // Include if mandatory or selected elective
            const isElective = course.type === 'ELECTIVE';
            const isSelected = selectedSet.has(course.id);
            if (isElective && !isSelected) continue;

            const isCompleted = completedSet.has(course.id);
            const status: 'Completed' | 'Selected' | 'Planned' = isCompleted
                ? 'Completed'
                : isSelected
                ? 'Selected'
                : 'Planned';

            totalSemCredits += semAllocatedCredits;
            rows.push({
                code: course.code,
                title: course.title,
                type: course.type,
                semesterCredits: semAllocatedCredits,
                status,
            });
        }

        const isUnderload = totalSemCredits < 18;
        const isOverload = totalSemCredits > 24;
        const isValid = !isUnderload && !isOverload;

        return {
            semesterIndex: sem,
            credits: totalSemCredits,
            rows,
            isUnderload,
            isOverload,
            isValid,
        };
    });

    // Calculate total planned credits
    const totalPlannedCredits = semesterGroups.reduce((acc, g) => acc + g.credits, 0);

    const isGraduationEligible = totalPlannedCredits >= totalCreditsRequired;
    const allSemestersValid = semesterGroups.every((g) => g.isValid);

    const renderSemesterCard = (group: SemesterGroupData) => (
        <View key={`sem-card-${group.semesterIndex}`} style={styles.semesterCard} wrap={false}>
            {/* Semester Header */}
            <View style={styles.semesterHeader}>
                <Text style={styles.semesterTitle}>Semester {group.semesterIndex}</Text>
                <Text
                    style={[
                        styles.semesterCredits,
                        group.isValid
                            ? styles.semValid
                            : group.isUnderload
                            ? styles.semUnderload
                            : styles.semOverload,
                    ]}
                >
                    {group.credits} Credits {group.isValid ? '✓' : group.isUnderload ? '(Underload < 18)' : '(Overload > 24)'}
                </Text>
            </View>

            {/* Table Column Headers */}
            <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.colCode]}>Course Code</Text>
                <Text style={[styles.tableHeaderCell, styles.colTitle]}>Course Title</Text>
                <Text style={[styles.tableHeaderCell, styles.colType]}>Type</Text>
                <Text style={[styles.tableHeaderCell, styles.colCredits]}>Credits</Text>
                <Text style={[styles.tableHeaderCell, styles.colStatus]}>Status</Text>
            </View>

            {/* Table Rows */}
            {group.rows.length === 0 ? (
                <View style={styles.tableRow}>
                    <Text style={[styles.colTitle, { width: '100%', color: '#94a3b8', fontStyle: 'italic' }]}>
                        No courses allocated for this semester term.
                    </Text>
                </View>
            ) : (
                group.rows.map((row, rIdx) => (
                    <View
                        key={`sem-${group.semesterIndex}-row-${row.code}`}
                        style={[styles.tableRow, rIdx % 2 === 1 ? styles.tableRowEven : {}]}
                    >
                        <Text style={styles.colCode}>{row.code}</Text>
                        <Text style={styles.colTitle}>{row.title}</Text>
                        <Text style={styles.colType}>{row.type}</Text>
                        <Text style={styles.colCredits}>{row.semesterCredits}</Text>
                        <Text
                            style={[
                                styles.colStatus,
                                row.status === 'Completed'
                                    ? styles.statusCompleted
                                    : row.status === 'Selected'
                                    ? styles.statusSelected
                                    : styles.statusPlanned,
                            ]}
                        >
                            {row.status}
                        </Text>
                    </View>
                ))
            )}
        </View>
    );

    return (
        <Document
            title={`CourseFlow Study Plan - ${resolvedName}`}
            author="CourseFlow Academic Planner"
            subject={`Academic Study Plan for ${resolvedName}`}
        >
            {/* ================= PAGE 1: SEMESTERS 1 - 4 ================= */}
            <Page size="A4" style={styles.page}>
                {/* Document Header */}
                <View style={styles.headerContainer}>
                    <View>
                        <Text style={styles.brandTitle}>CourseFlow Academic Study Plan</Text>
                        <Text style={styles.brandSub}>Official Curriculum Progression & Graduation Audit</Text>
                        <Text style={styles.degreeTitle}>{resolvedName}</Text>
                        <Text style={styles.departmentText}>{resolvedDept}</Text>
                    </View>

                    <View style={styles.metaBox}>
                        <Text style={styles.metaText}>Generated: {dateFormatted}</Text>
                        <Text style={styles.metaText}>Study Plan: {planName || 'Default Plan'}</Text>
                        <View
                            style={[
                                styles.progressBadge,
                                isGraduationEligible ? styles.badgeValid : styles.badgeInvalid,
                            ]}
                        >
                            <Text
                                style={
                                    isGraduationEligible ? styles.badgeTextValid : styles.badgeTextInvalid
                                }
                            >
                                Planned: {totalPlannedCredits} / {totalCreditsRequired} Credits {isGraduationEligible ? '✓' : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Semesters 1 to 4 */}
                {semesterGroups.slice(0, 4).map(renderSemesterCard)}

                {/* Page 1 Footer */}
                <View style={styles.footer} fixed>
                    <Text>CourseFlow • Autonomous Academic Degree Planner</Text>
                    <Text>Page 1 of 2 (Semesters 1 - 4)</Text>
                </View>
            </Page>

            {/* ================= PAGE 2: SEMESTERS 5 - 8 ================= */}
            <Page size="A4" style={styles.page}>
                {/* Page 2 Compact Header */}
                <View style={styles.page2Header}>
                    <View>
                        <Text style={styles.page2Title}>
                            {resolvedName} • Advanced Division (Semesters 5 - 8)
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Text style={styles.metaText}>
                            Total Planned: {totalPlannedCredits} / {totalCreditsRequired} Credits
                        </Text>
                    </View>
                </View>

                {/* Semesters 5 to 8 */}
                {semesterGroups.slice(4, 8).map(renderSemesterCard)}

                {/* Official Compliance Verification Stamp */}
                <View style={styles.stampContainer}>
                    <View style={{ maxWidth: '75%' }}>
                        <Text style={styles.stampTitle}>Academic Compliance Verification</Text>
                        <Text style={styles.stampSubtitle}>
                            ✓ 8-Semester Workload: {allSemestersValid ? 'All terms comply with >= 18 credits minimum' : 'One or more terms have credit warnings'}
                        </Text>
                        <Text style={styles.stampSubtitle}>
                            ✓ Graduation Requirement: {isGraduationEligible ? `150 Total Credits Met (${totalPlannedCredits} Credits)` : `Credit deficit (${totalPlannedCredits} / ${totalCreditsRequired} Credits)`}
                        </Text>
                    </View>

                    <View style={styles.stampBadge}>
                        <Text style={styles.stampBadgeText}>
                            {isGraduationEligible && allSemestersValid ? 'COMPLIANT' : 'PROVISIONAL'}
                        </Text>
                    </View>
                </View>

                {/* Page 2 Footer */}
                <View style={styles.footer} fixed>
                    <Text>CourseFlow • Autonomous Academic Degree Planner</Text>
                    <Text>Page 2 of 2 (Semesters 5 - 8)</Text>
                </View>
            </Page>
        </Document>
    );
}
