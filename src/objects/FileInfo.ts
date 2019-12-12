export interface FileInfo {
    id: number;
    displayName: string;
    fileName: string;
    fileDate: string;
    fileLength: number;
    releaseType: number;
    downloadUrl: string;
    isAlternate: boolean;
    alternateFileId: number;
    dependencies: [];
    isAvailable: boolean;
    gameVersion: string[];
}
