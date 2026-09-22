// #region imports
    // #region external
    import {
        parseLocator,
        type LocatorStatements,
        CollectionStatement,
        DocumentStatement,
    } from '../../../locator/index';
    // #endregion external
// #endregion imports



// #region module
class Updater<D, U> {
    private locator: LocatorStatements;
    private data: D;
    private update: U;

    constructor(
        locator: string | LocatorStatements,
        data: D,
        update: U,
    ) {
        this.locator = typeof locator === 'string'
            ? parseLocator(locator)
            : locator;

        this.data = {
            ...data,
        };
        this.update = update;
    }

    public result() {
        const collections = this.data as Record<string, Record<string, unknown>[]>;
        let collectionData!: Record<string, unknown>[];
        let collectionName!: string;

        for (const locator of this.locator) {
            if (locator instanceof CollectionStatement) {
                collectionName = locator.name;
                collectionData = collections[locator.name];
                continue;
            }

            if (locator instanceof DocumentStatement) {
                const updatedCollection = collectionData.map((document) => {
                    for (const key of locator.keys) {
                        if (document[key.key] === key.value) {
                            return {
                                ...document,
                                ...this.update,
                            };
                        }
                    }

                    return {
                        ...document,
                    };
                });

                collectionData = updatedCollection;

                continue;
            }
        }

        const result = {
            ...this.data,
        } as Record<string, unknown>;
        result[collectionName] = [
            ...collectionData,
        ];

        return result as D;
    }
}
// #endregion module



// #region exports
export default Updater;
// #endregion exports
