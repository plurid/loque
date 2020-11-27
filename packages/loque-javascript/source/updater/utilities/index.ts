// #region imports
    // #region external
    import Updater from '../objects/Updater';

    import {
        LocatorStatements,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
const handleUpdate = <D, U>(
    locator: string | LocatorStatements,
    data: D,
    update: U,
): D => {
    const updater = new Updater<D, U>(
        locator,
        data,
        update,
    );
    const result: D = updater.result();

    return result;
}
// #endregion module



// #region exports
export {
    handleUpdate,
};
// #endregion exports
