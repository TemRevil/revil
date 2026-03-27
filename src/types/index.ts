export interface TagData {
    id?: string | number;
    name: string;
    color?: string;
    iconSvg?: string;
}

export interface TagFormData extends TagData {
    iconFile?: File;
}

export interface ContributorData {
    id?: string | number;
    name: string;
    role: string;
    jobTitle?: string;
    image?: File | string;
    socials?: {
        github?: string;
        linkedin?: string;
        facebook?: string;
        instagram?: string;
        portfolio?: string;
    };
    links?: Record<string, string | undefined>;
}

export interface ProjectData {
    id?: string | number;
    title?: string;
    name: string;
    description: string;
    fullDescription?: string;
    images: string[];
    stack?: string[];
    tags: TagData[];
    contributors: ContributorData[];
    repoLink: string;
    liveLink: string;
    demoLink?: string;
    downloadLink?: string;
    icon?: string;
    views?: number;
    githubViews?: number;
    liveViews?: number;
    downloadViews?: number;
    listing?: number;
}

export interface ProjectFormData extends Omit<ProjectData, 'images' | 'icon'> {
    images: (File | string)[];
    icon?: File | string;
}
