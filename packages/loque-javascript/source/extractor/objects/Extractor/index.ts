// #region imports
    // #region external
    import {
        parseLocator,
        LocatorStatements,
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

    public extract<E>() {
        return {} as E;
    }
}
// #endregion module



// #region exports
export default Extractor;
// #endregion exports
