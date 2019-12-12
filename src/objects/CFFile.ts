import { manifest } from "../index";
import { IFile, DepType } from "./IFile";
import { CFProjectInfo } from "./CFProjectInfo";
import { FileInfo } from "./FileInfo";
import * as curse from "../utils/cursemeta";

export class CFFile implements IFile {
    projectId: number;
    fileId: number = null as number;
    projectInfo: CFProjectInfo;
    info: FileInfo;
    depType: DepType = DepType.COMMON;

    private constructor(projectId: number, depType: DepType, fileId?: number) {
        this.projectId = projectId;
        this.fileId = fileId;
        this.depType = depType;
    }

    public static async create(projectId: number, depType: DepType, fileId?: number): Promise<CFFile> {
        const o = new CFFile(projectId, depType, fileId);
        const projectInfo = await curse.getAddon(o.projectId);
        o.projectInfo = projectInfo;
        const files: FileInfo[] = await curse.getAddonFiles(o.projectId);
        //console.log(files)
        {
            let tmp: any = {};
            projectInfo.gameVersionLatestFiles.forEach((el: any) => {
                if (tmp[el.gameVersion] === undefined)
                    tmp[el.gameVersion] = [];
                const f = files.filter(el2 => el2.id === el.projectFileId)[0];
                tmp[el.gameVersion].push(f);
            });
            Object.keys(tmp).forEach((key) => {
                tmp[key] = tmp[key].sort(curse.sortByDate).reverse();
            });
            o.projectInfo.gameVersionLatestFiles = tmp;
        }
        if (o.fileId === undefined) {
            try {
                o.fileId = o.projectInfo.gameVersionLatestFiles[manifest.gameVersion][0].id;
                fileId = o.fileId;
            }
            catch (e) {
                console.error("No file found for current game version!");
                process.exit(1);
            }
        }
        o.info = files.filter(el => el.id === o.fileId)[0];
        return o;
    }

    async getDownloadUrl() {
        return this.info.downloadUrl;
    }

    getFileName() {
        return this.info.fileName;
    }

    canUpdate() {
        //console.dir(this.projectInfo.gameVersionLatestFiles[manifest.gameVersion])
        const f = this.projectInfo.gameVersionLatestFiles[manifest.gameVersion][0];
        return typeof f.id === 'number' && f.id !== this.fileId;
    }

    getDepType() {
        return this.depType;
    }

    equals(other: IFile): boolean {
        return other instanceof CFFile && this.projectId == other.projectId;
    }

    getUpdateRef(): Promise<IFile> {
        if (this.canUpdate()) {
            return CFFile.create(this.projectId, this.projectInfo.gameVersionLatestFiles[manifest.gameVersion][0].id);
        }
        else {
            return Promise.resolve(this);
        }
    }

    toJSON() {
        return {
            name: this.info.fileName,
            projectId: this.projectId,
            fileId: this.fileId
        };
    }

    static fromJSON(obj: any): Promise<CFFile> {
        return this.create(obj.projectId, obj.fileId);
    }
}
