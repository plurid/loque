// #region imports
    // #region external
    import Updater from '../objects/Updater';

    import {
        LocatorStatements,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
const handleUpdate = (
    locator: string | LocatorStatements,
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
