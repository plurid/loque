// #region imports
    // #region external
    import {
        parseLocator,
        LocatorStatements,
        CollectionStatement,
        DocumentStatement,
    } from '#locator/index';

    import {
        ExtractedLoque,
    } from '../../data/interfaces';
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

    public extract<E>(): ExtractedLoque<E> {
        let collectionData;
        let documents: any = [];
        let cursor = undefined;

        for (const locator of this.locator) {
            if (locator instanceof CollectionStatement) {
                collectionData = this.data[locator.name];
                continue;
            }

            if (locator instanceof DocumentStatement) {
                for (const key of locator.keys) {
                    for (const [index, document] of collectionData.entries()) {
                        if (document[key.key] === key.value) {
                            documents.push(document);

                            cursor = index;
                        }
                    }
                }

                continue;
            }
        }

        const result: ExtractedLoque<E> = {
            data: documents.length === 1
                ? documents[0] as E
                : documents as E,
            empty: documents.length === 0,
            cursor,
        };

        return result;
    }
}
// #endregion module



// #region exports
export default Extractor;
// #endregion exports
