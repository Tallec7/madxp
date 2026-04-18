import { PiConfigVideoEntry } from "./video.interface";

export interface Category {
    id: string;
    name: string;
    videos?: PiConfigVideoEntry[];
    subCategories?: Category[]; 
}