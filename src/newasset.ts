interface Asset<AssetItem = any, Metadata extends object = any> {
	kind?: string;
	id?: string;
	name?: string;
	metadata?: Partial<Metadata>;
	item?: AssetItem;
}

type AssetProcessor = (ra: Asset) => Promise<Asset>;
type LibraryPlugin = (lib: AssetLibrary) => void;

interface AssetLibrary {
	process: AssetProcessor;
}

// plugins = [parser, dependencies, importer, dataloader, datacache, generator]

const makeLibrary = (plugins: LibraryPlugin[]) => {
	const library: AssetLibrary = { process: assetParser };
	parserPlugin(library);

	for (const plugin of plugins) {
		plugin(library);
	}
	return library;
};

// ----------

const parsers: { [kind: string]: AssetProcessor; } = {};
const registerParser = (kind: string, parser: AssetProcessor) => {
	parsers[kind] = parser;
};

const parserPlugin = (lib: AssetLibrary) => {
	for (const kind in parsers) {
		const parser = parsers[kind];
		// add typed parser to lib
	}
};

const assetParser: AssetProcessor = (ra: Asset) =>
	new Promise<Asset>((resolve, reject) => {
		if (ra.item !== void 0) {
			return resolve(ra);
		}
		if (ra.kind !== void 0) {
			const parser = parsers[ra.kind];
			if (parser !== void 0) {
				return resolve(parser(ra));
			}
			return reject(`No parser registered for asset kind "${ra.kind}"`);
		}
		return reject("Asset does not have a kind property, cannot parse.");
	});

// ----------

interface Asset {
	dependencies?: Asset[];
}

const dependenciesPlugin: LibraryPlugin = (lib: AssetLibrary) => {
	const dependenciesProcessor: AssetProcessor = (ra: Asset) => {
		if (Array.isArray(ra.dependencies)) {
			return Promise.all(ra.dependencies.map(dep => lib.process(dep)))
				.then(() => ra);
		}
		return Promise.resolve(ra);
	};

	lib.process = (ra: Asset) => dependenciesProcessor(ra).then(lib.process);
};

// ----------

interface Asset {
	mimeType?: string;
	dataPath?: string;
	dataBlob?: Blob;
}

type DataLoader = (path: string, mimeType?: string) => Promise<Blob>;

const dataLoaderPlugin = (rootLoader: DataLoader) => (lib: AssetLibrary) => {
	const loaderProcessor: AssetProcessor = (ra: Asset) => {
		if (ra.dataPath !== void 0 && ra.dataBlob === void 0) {
			return rootLoader(ra.dataPath, ra.mimeType)
				.then(blob => {
					ra.dataBlob = blob;
					return ra;
				});
		}
		return Promise.resolve(ra);
	};

	lib.process = (ra: Asset) => loaderProcessor(ra).then(lib.process);
};

// ----------
