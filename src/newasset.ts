interface Asset<AssetItem = any, Metadata extends object = any> {
    guid?: string;
	kind?: string;
	name?: string;
	mimeType?: string;
    metadata?: Partial<Metadata>;
    item?: AssetItem;
}

let nextAssetID = 1;
const nextAnonymousAssetGUID = (kind: string, name: string) =>
	`${kind}_${name || "anonymous"}_${nextAssetID++}`;

const makeAsset = (kind: string, name?: string, guid?: string): Asset => ({
	guid: guid || nextAnonymousAssetGUID(kind, name || ""),
	kind,
	name
});

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

type AssetProcessor = (ra: Asset) => Promise<Asset>;
type LibraryPlugin = (lib: AssetLibrary) => void;

interface AssetLibrary {
    parser: AssetProcessor;
}

// plugins = [parser, dependencies, import, dataloader, datacache]

const makeLibrary = (plugins: LibraryPlugin[]) => {
    const library: AssetLibrary = { parser: assetParser };
    parserPlugin(library);

    for (const plugin of plugins) {
        plugin(library);
    }
    return library;
};

// ----------

interface Asset {
    dependencies?: Asset[];
}

const dependenciesPlugin: LibraryPlugin = (lib: AssetLibrary) => {
    const dependenciesProcessor: AssetProcessor = (ra: Asset) => {
        if (Array.isArray(ra.dependencies)) {
            return Promise.all(ra.dependencies.map(dep => lib.parser(dep)))
                .then(() => ra);
        }
        return Promise.resolve(ra);
    };

    lib.parser = (ra: Asset) => dependenciesProcessor(ra).then(lib.parser);
};

// ----------

interface Asset {
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

    lib.parser = (ra: Asset) => loaderProcessor(ra).then(lib.parser);
};

// ----------
