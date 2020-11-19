// #region imports
    // #region internal
    import Updater from '../objects/Updater';
    // #endregion internal
// #endregion imports



// #region module
const handleUpdate = (
    locator: any,
    data: any,
    update: any,
) => {
    const updater = new Updater(
        locator,
        data,
        update,
    );
    const result = updater.result();

    return result;
}
// #endregion module



// #region exports
export {
    handleUpdate,
};
// #endregion exports
