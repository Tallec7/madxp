import { Video } from "./video.interface";

export interface Category {
    id: string;
    name: string;
    videos?: Video[];
    subCategories?: Category[]; 
}