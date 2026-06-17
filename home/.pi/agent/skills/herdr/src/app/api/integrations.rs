use crate::api::schema::{IntegrationInstallResult, IntegrationUninstallResult, ResponseResult};
use crate::app::App;

use super::responses::{encode_error, encode_success};

impl App {
    pub(super) fn handle_integration_install(
        &mut self,
        id: String,
        params: crate::api::schema::IntegrationInstallParams,
    ) -> String {
        let target = params.target;
        let messages = match crate::integration::install_target(target) {
            Ok(messages) => messages,
            Err(err) => return encode_error(id, "integration_install_failed", err.to_string()),
        };

        encode_success(
            id,
            ResponseResult::IntegrationInstall {
                target,
                details: IntegrationInstallResult { messages },
            },
        )
    }

    pub(super) fn handle_integration_uninstall(
        &mut self,
        id: String,
        params: crate::api::schema::IntegrationUninstallParams,
    ) -> String {
        let target = params.target;
        let messages = match crate::integration::uninstall_target(target) {
            Ok(messages) => messages,
            Err(err) => return encode_error(id, "integration_uninstall_failed", err.to_string()),
        };

        encode_success(
            id,
            ResponseResult::IntegrationUninstall {
                target,
                details: IntegrationUninstallResult { messages },
            },
        )
    }
}
