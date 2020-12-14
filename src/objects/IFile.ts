export interface IFile {
    fetch(): Promise<IFile>;
    getDownloadUrl(): Promise<string>;
    toJSON(): object;
    getFileName(): string;
    canUpdate(): boolean;
    getUpdateRef(): Promise<IFile>;
    getDepType(): PackDepType;
    getDependencies(depType: FileDepType): Promise<IFile[]>;
    equals(other: IFile): boolean;
}

export enum PackDepType {
    COMMON, CLIENT, SERVER
}

export enum FileDepType {
    ALL,
    // EMBEDDED = 1,
    OPTIONAL,// = 2,
    REQUIRED//= 3,
    // TOOL = 4,
    // INCOMPATIBLE = 5,
    // INCLUDE = 6,
}