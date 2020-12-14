export interface IFile {
    fetch(): Promise<IFile>;
    getDownloadUrl(): Promise<string>;
    toJSON(): object;
    getFileName(): string;
    canUpdate(): boolean;
    getUpdateRef(): Promise<IFile>;
    getDepType(): DepType;
    getDependencies(): Promise<IFile[]>;
    equals(other: IFile): boolean;
}

export enum DepType {
    COMMON, CLIENT, SERVER
}