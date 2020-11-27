// #region imports
    // #region external
    import {
        parseLocator,
        LocatorStatements,
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

        this.data = data;
        this.update = update;
    }

    public result() {
        return {} as D;
    }
}
// #endregion module



// #region exports
export default Updater;
// #endregion exports
