import { FileDepType, IFile, PackDepType } from "./IFile";
import { CFProjectInfo } from "./CFProjectInfo";
import { FileInfo } from "./FileInfo";
import * as curse from "../utils/cursemeta";
import { Manifest } from "./Manifest";

const FILE_REQUIRED = 3;
const FILE_OPTIONAL = 2;

export class CFFile implements IFile {
	projectId: number;
	fileId: number = null as number;

	projectInfo: CFProjectInfo;
	info: FileInfo;

	fileName: string;

	depType: PackDepType = PackDepType.COMMON;

	manifest: Manifest;

	fetched: boolean = false;

	constructor(manifest: Manifest, projectId: number, fileId?: number) {
		this.projectId = projectId;
		this.fileId = fileId;
		this.manifest = manifest;
	}

	public async fetch(): Promise<CFFile> {
		if (!this.fetched) {
			this.fetched = true;

			console.log(`Fetching info for ${this.fileName || this.projectId}`)

			const projectInfo = await curse.getAddon(this.projectId);
			this.projectInfo = projectInfo;
			const files: FileInfo[] = await curse.getAddonFiles(this.projectId);
			console.log(`Done fetching info for ${this.fileName || this.projectId}`)

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
				this.projectInfo.gameVersionLatestFiles = tmp;
			}

			if (this.fileId === undefined) {
				try {
					this.fileId = this.projectInfo.gameVersionLatestFiles[this.manifest.gameVersion][0].id;
				}
				catch (e) {
					// console.error("No file found for current game version!");
					// console.debug(e);
					// process.exit(1);
					throw new Error("No file found for current game version!")
				}
			}
			this.info = files.filter(el => el.id === this.fileId)[0];

			this.fileName = this.info.fileName;

			return this;
		} else {
			return this;
		}
	}

	// public static async create(manifest: Manifest, projectId: number, fileId?: number): Promise<CFFile> {
	// 	const o = new CFFile(manifest, projectId, fileId);
	// 	return o;
	// }

	// private _checkFetch

	async getDownloadUrl() {
		return this.info.downloadUrl;
	}

	getFileName() {
		return this.fileName;
	}

	canUpdate() {
		//console.dir(this.projectInfo.gameVersionLatestFiles[manifest.gameVersion])
		const f = this.projectInfo.gameVersionLatestFiles[this.manifest.gameVersion][0];
		return typeof f.id === 'number' && f.id !== this.fileId;
	}

	getDepType() {
		return this.depType;
	}

	getDependencies(depType: FileDepType = FileDepType.ALL) {
		let res = this.info.dependencies;

		if (depType != FileDepType.ALL) {
			res = res.filter(obj => depType === FileDepType.REQUIRED ? obj.type === FILE_REQUIRED : obj.type === FILE_OPTIONAL);
		}
			
		return Promise.resolve(res.map(obj => new CFFile(this.manifest, obj.addonId)));
	}

	// equals(other: IFile): boolean {
	// 	return other instanceof CFFile && this.projectId === other.projectId && this.fileId === other.fileId;
	// }

	equals(other: IFile): boolean {
		return other instanceof CFFile && this.projectId === other.projectId;
	}

	async getUpdateRef() {
		if (this.canUpdate()) {
			await this.fetch();
			const ref = new CFFile(this.manifest, this.projectId, this.projectInfo.gameVersionLatestFiles[this.manifest.gameVersion][0].id);
			return await ref.fetch();
		}
		else {
			return this;
		}
	}

	toJSON() {
		return {
			name: this.fileName,
			projectId: this.projectId,
			fileId: this.fileId
		};
	}

	static fromJSON(manifest: Manifest, obj: any): CFFile {
		const ref = new CFFile(manifest, obj.projectId, obj.fileId);
		ref.fileName = obj.name;
		return ref;
	}
}
