import { describe, expect, it } from 'vitest';
import { getProgramCourses } from '@/data/mockCourses';
import {
    buildCourseUpdate,
    courseFromAdminCourse,
    courseToFormValues,
    mapValidationDetail,
    resizeDistribution,
    validateCourseForm,
} from '@/features/admin/utils/courseForm';
import type { AdminCourse, CourseFormValues } from '@/features/admin/utils/courseForm';
import type { Course } from '@/types/curriculum';

function courseIn(programId: string, courseId: string): Course {
    const course = getProgramCourses(programId).find((candidate) => candidate.id === courseId);
    if (!course) throw new Error(`${courseId} missing from ${programId}`);
    return course;
}

function catalogIds(programId: string): Set<string> {
    return new Set(getProgramCourses(programId).map((course) => course.id));
}

const CE = 'computer-eng';
const EE = 'electrical-eng';

describe('course editor form (CF-212)', () => {
    describe('courseToFormValues', () => {
        it('copies a single-semester course, keeping contact hours as hours per semester', () => {
            const values = courseToFormValues(courseIn(CE, 'CE1101'));

            expect(values).toMatchObject({
                totalCredits: '1',
                recommendedSemester: '1',
                durationSemesters: '1',
                lectureHours: '14',
                labHours: '14',
                tutorialHours: '7',
                offeredSemesters: ['FALL'],
                distributionCredits: ['1'],
            });
        });

        it.each([
            [CE, 'EC7802'],
            [EE, 'EEE7803'],
        ])('lists one credit row per semester for multi-semester %s course %s', (programId, courseId) => {
            const values = courseToFormValues(courseIn(programId, courseId));

            expect(values.durationSemesters).toBe('2');
            expect(values.distributionCredits).toEqual(['4', '4']);
        });
    });

    describe('validateCourseForm', () => {
        const ce1101 = courseIn(CE, 'CE1101');
        const valid = () => courseToFormValues(ce1101);
        const validate = (values: CourseFormValues) => validateCourseForm(values, 'CE1101', catalogIds(CE));

        it('accepts an unchanged catalog course from either program', () => {
            expect(validate(valid())).toEqual({});
            const ee = courseIn(EE, 'EEE7803');
            expect(validateCourseForm(courseToFormValues(ee), ee.id, catalogIds(EE))).toEqual({});
        });

        it.each(['0', '13', '2.5', '', 'abc'])('rejects %j total credits', (totalCredits) => {
            expect(validate({ ...valid(), totalCredits }).totalCredits).toBe(
                'Enter whole credits from 1 to 12.'
            );
        });

        it('accepts the 1 and 12 credit bounds', () => {
            expect(validate({ ...valid(), totalCredits: '1' }).totalCredits).toBeUndefined();
            expect(validate({ ...valid(), totalCredits: '12', distributionCredits: ['12'] })).toEqual({});
        });

        it('requires a title after trimming', () => {
            expect(validate({ ...valid(), title: '   ' }).title).toBe('Enter a course title.');
        });

        it('keeps a course inside the 8-semester window', () => {
            const errors = validate({
                ...valid(),
                recommendedSemester: '7',
                durationSemesters: '3',
                distributionCredits: ['1', '0', '0'],
            });

            expect(errors.durationSemesters).toBe('A course starting in semester 7 can last at most 2 semesters.');
        });

        it('requires the credit split of a multi-semester course to sum to the total', () => {
            const ec7802 = courseIn(CE, 'EC7802');
            const errors = validateCourseForm(
                { ...courseToFormValues(ec7802), totalCredits: '10' },
                ec7802.id,
                catalogIds(CE)
            );

            expect(errors.distributionCredits).toBe('The semesters add up to 8 credits, but the course has 10.');
        });

        it('requires a whole number in every credit-split row', () => {
            const ec7802 = courseIn(CE, 'EC7802');
            const errors = validateCourseForm(
                { ...courseToFormValues(ec7802), distributionCredits: ['8', ''] },
                ec7802.id,
                catalogIds(CE)
            );

            expect(errors.distributionCredits).toBe('Enter whole credits for every semester (0 is allowed).');
        });

        it('does not let a course list itself as a corequisite', () => {
            expect(validate({ ...valid(), corequisites: ['CE1101'] }).corequisites).toBe(
                "A course can't be its own corequisite."
            );
        });

        it('only allows corequisites from the active program catalog', () => {
            expect(validate({ ...valid(), corequisites: ['ZZ9999'] }).corequisites).toBe(
                "ZZ9999 isn't in this program's catalog."
            );
        });

        it('rejects contact hours that are not whole numbers but allows them empty', () => {
            expect(validate({ ...valid(), labHours: '-2' }).labHours).toBe('Enter whole hours, or leave it empty.');
            expect(validate({ ...valid(), lectureHours: '', labHours: '', tutorialHours: '' })).toEqual({});
        });
    });

    describe('buildCourseUpdate', () => {
        it('sends only the editable fields, never id, code or prerequisiteRule', () => {
            const body = buildCourseUpdate(courseToFormValues(courseIn(CE, 'CE1101')));

            expect(Object.keys(body).sort()).toEqual(
                [
                    'contactHours',
                    'corequisites',
                    'description',
                    'durationSemesters',
                    'offeredSemesters',
                    'recommendedSemester',
                    'syllabusObjectives',
                    'title',
                    'totalCredits',
                    'type',
                ].sort()
            );
            expect(body).toMatchObject({ totalCredits: 1, recommendedSemester: 1, contactHours: { lecture: 14, lab: 14, tutorial: 7 } });
        });

        it.each([
            [CE, 'EC7802'],
            [EE, 'EEE7803'],
        ])('sends a credit distribution for multi-semester %s course %s', (programId, courseId) => {
            const values = { ...courseToFormValues(courseIn(programId, courseId)), totalCredits: '9', distributionCredits: ['5', '4'] };

            expect(buildCourseUpdate(values).creditDistribution).toEqual([
                { semesterIndex: 7, creditsAllocated: 5 },
                { semesterIndex: 8, creditsAllocated: 4 },
            ]);
        });

        it('trims the title and drops blank objectives', () => {
            const values = {
                ...courseToFormValues(courseIn(CE, 'CE1101')),
                title: '  Basic Concepts  ',
                syllabusObjectives: [' Understand ecosystems ', '', '   '],
            };

            const body = buildCourseUpdate(values);

            expect(body.title).toBe('Basic Concepts');
            expect(body.syllabusObjectives).toEqual(['Understand ecosystems']);
        });

        it('clears contact hours when every field is empty and fills gaps with 0 otherwise', () => {
            const base = courseToFormValues(courseIn(CE, 'CE1101'));

            expect(buildCourseUpdate({ ...base, lectureHours: '', labHours: '', tutorialHours: '' }).contactHours).toBeNull();
            expect(buildCourseUpdate({ ...base, lectureHours: '28', labHours: '', tutorialHours: '' }).contactHours).toEqual({
                lecture: 28,
                lab: 0,
                tutorial: 0,
            });
        });
    });

    describe('resizeDistribution', () => {
        it('adds empty rows when the duration grows and trims when it shrinks', () => {
            expect(resizeDistribution(['4'], 3)).toEqual(['4', '', '']);
            expect(resizeDistribution(['4', '4', '0'], 1)).toEqual(['4']);
        });
    });

    describe('courseFromAdminCourse', () => {
        it('takes the saved fields but keeps the prerequisite rule, which CF-213 edits', () => {
            const withRule = getProgramCourses(EE).find((course) => course.prerequisiteRule !== null);
            if (!withRule) throw new Error('expected an EE course with prerequisites');
            const saved: AdminCourse = {
                ...withRule,
                title: 'Renamed',
                totalCredits: 4,
                creditDistribution: [{ semesterIndex: withRule.recommendedSemester, creditsAllocated: 4 }],
                prerequisiteRule: null,
                contactHours: null,
                updatedAt: '2026-11-22T10:00:00Z',
            };

            const course = courseFromAdminCourse(withRule, saved);

            expect(course.title).toBe('Renamed');
            expect(course.totalCredits).toBe(4);
            expect(course.creditDistribution).toEqual(saved.creditDistribution);
            expect(course.prerequisiteRule).toBe(withRule.prerequisiteRule);
            expect(course.contactHours).toBeUndefined();
            expect(course).not.toHaveProperty('updatedAt');
        });
    });

    describe('mapValidationDetail', () => {
        it('puts each server message next to the matching field', () => {
            const { fieldErrors, formError } = mapValidationDetail([
                { loc: ['body', 'totalCredits'], msg: 'Input should be less than or equal to 12', type: 'less_than_equal' },
                { loc: ['body', 'creditDistribution'], msg: 'Allocated credits sum to 7 but totalCredits is 8.', type: 'value_error' },
                { loc: ['body', 'contactHours', 'lab'], msg: 'Input should be greater than or equal to 0', type: 'greater_than_equal' },
            ]);

            expect(fieldErrors).toEqual({
                totalCredits: 'Input should be less than or equal to 12',
                distributionCredits: 'Allocated credits sum to 7 but totalCredits is 8.',
                labHours: 'Input should be greater than or equal to 0',
            });
            expect(formError).toBeNull();
        });

        it('shows messages it cannot place as a form-level error', () => {
            const { fieldErrors, formError } = mapValidationDetail([
                { loc: ['body', 'prerequisiteRule'], msg: 'Extra inputs are not permitted', type: 'extra_forbidden' },
            ]);

            expect(fieldErrors).toEqual({});
            expect(formError).toBe('Extra inputs are not permitted');
        });

        it('falls back to a generic message for an unexpected body', () => {
            expect(mapValidationDetail('nope').formError).toBe('The server rejected these changes.');
        });
    });
});
