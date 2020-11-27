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
        let collectionData;
        let collectionName: any;

        for (const locator of this.locator) {
            if (locator instanceof CollectionStatement) {
                collectionName = locator.name;
                collectionData = this.data[locator.name];
                continue;
            }

            if (locator instanceof DocumentStatement) {
                const updatedCollection: any[] = collectionData.map((document: any) => {
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
        };
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
