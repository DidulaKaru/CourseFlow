import rawComputerEngineering from './programs/computer_engineering.json';
import type { Course, DegreeProgram } from '@/types/curriculum';

export const mockComputerEngineeringProgram = rawComputerEngineering as unknown as DegreeProgram;
export const mockCourses: Course[] = mockComputerEngineeringProgram.courses;
