// #region module
class Updater {
    private locator: any;
    private data: any;
    private update: any;

    constructor(
        locator: any,
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
