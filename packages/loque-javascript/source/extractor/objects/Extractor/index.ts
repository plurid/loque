// #region imports
    // #region external
    import {
        LocatorStatements,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
class Extractor {
    private data: any;
    private locator: string | LocatorStatements;

    constructor(
        locator: string | LocatorStatements,
        data: any,
    ) {
        this.data = data;
        this.locator = locator;
    }

    public extract() {
        return '' as any;
    }
}
// #endregion module



// #region exports
export default Extractor;
// #endregion exports
