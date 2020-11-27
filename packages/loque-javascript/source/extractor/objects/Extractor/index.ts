// #region imports
    // #region external
    import {
        parseLocator,
        LocatorStatements,
        CollectionStatement,
        DocumentStatement,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
class Extractor<D> {
    private locator: LocatorStatements;
    private data: D;

    constructor(
        locator: string | LocatorStatements,
        data: D,
    ) {
        this.locator = typeof locator === 'string'
            ? parseLocator(locator)
            : locator;

        this.data = data;
    }

    public extract<E>(): E {
        let collectionData;
        let documents: any = [];

        for (const locator of this.locator) {
            if (locator instanceof CollectionStatement) {
                collectionData = this.data[locator.name];
                continue;
            }

            if (locator instanceof DocumentStatement) {
                for (const key of locator.keys) {
                    for (const document of collectionData) {
                        if (document[key.key] === key.value) {
                            documents.push(document);
                        }
                    }
                }

                continue;
            }
        }

        return documents as E;
    }
}
// #endregion module



// #region exports
export default Extractor;
// #endregion exports
