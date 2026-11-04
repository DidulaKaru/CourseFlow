import rawComputerEngineering from './programs/computer_engineering.json';
import rawElectricalEngineering from './programs/electrical_engineering.json';
import type { Course, DegreeProgram } from '@/types/curriculum';

export const mockComputerEngineeringProgram = rawComputerEngineering as unknown as DegreeProgram;
export const mockElectricalEngineeringProgram = rawElectricalEngineering as unknown as DegreeProgram;

export const PROGRAMS: Record<string, DegreeProgram> = {
    'computer-eng': mockComputerEngineeringProgram,
    'electrical-eng': mockElectricalEngineeringProgram,
};

export const AVAILABLE_PROGRAMS: DegreeProgram[] = [
    mockComputerEngineeringProgram,
    mockElectricalEngineeringProgram,
];

export function getProgram(programId: string): DegreeProgram {
    return PROGRAMS[programId] ?? mockComputerEngineeringProgram;
}

export function getProgramCourses(programId: string): Course[] {
    return getProgram(programId).courses;
}

export const mockCourses: Course[] = mockComputerEngineeringProgram.courses;
