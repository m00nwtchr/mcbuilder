import { FileInfo } from "./FileInfo";

export interface CFProjectInfo {
    id: number;
    name: string;
    authors: any[];
    websiteUrl: string;
    summary: string;
    defaultFileId: number;
    downloadCount: number;
    latestFiles: FileInfo[];
    gameVersionLatestFiles: {
        [id: string]: FileInfo[];
    };
    slug: string;
    categorySection: {id:number,gameCategoryId:number};
}
