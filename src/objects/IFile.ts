export interface IFile {
    getDownloadUrl(): Promise<string>;
    toJSON(): object;
    getFileName(): string;
    canUpdate(): boolean;
    getUpdateRef(): Promise<IFile>;
    getDepType(): DepType;
    equals(other: IFile): boolean;
}

export enum DepType {
    COMMON, CLIENT, SERVER
}