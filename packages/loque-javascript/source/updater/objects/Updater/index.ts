// #region imports
    // #region external
    import {
        LocatorStatements,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
class Updater {
    private locator: string | LocatorStatements;
    private data: any;
    private update: any;

    constructor(
        locator: string | LocatorStatements,
        data: any,
        update: any,
    ) {
        this.locator = locator;
        this.data = data;
        this.update = update;
    }

    public result() {
        return '' as any;
    }
}
// #endregion module



// #region exports
export default Updater;
// #endregion exports
