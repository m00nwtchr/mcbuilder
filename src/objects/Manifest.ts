import { IFile } from "./IFile";
export class Manifest {
    name: string;
    version: string = "1.0.0";
    gameVersion: string;
    description: string;
    author: string;
    dependencies: IFile[] = [];
    constructor(name: string, gameVersion: string, description: string, author: string) {
        this.name = name;
        this.description = description;
        this.author = author;
        this.gameVersion = gameVersion;
    }
}
